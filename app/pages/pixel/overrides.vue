<script setup lang="ts">
useHead({ title: 'ERP overrides · Pixel 3 Enterprise' })
const rows = [
  ['Dropdown', 'MpSelect (OS dropdown)', 'ErpFilterSelect (popover, clearable)', 'rule/select-erpfilterselect'],
  ['Secondary button', 'gray text', 'black text + bold border', 'rule/btn-secondary-black'],
  ['Cancel button', 'secondary', 'ghost', 'rule/btn-cancel-ghost'],
  ['Drawer', 'MpDrawer (broken here)', 'Teleport shell', 'rule/drawer-custom-shell'],
  ['Card surface', 'shadow', '1px border, flat', 'rule/surface-border-no-shadow'],
  ['Errors', 'toast', 'inline', 'rule/form-errors-inline'],
]
</script>
<template>
  <div>
    <h1 class="pxpagetitle">ERP overrides — Pixel default vs Enterprise</h1>
    <div class="ov-scroll">
      <table class="ovtbl">
        <colgroup><col style="width:200px"><col style="width:240px"><col style="width:280px"><col style="width:280px"></colgroup>
        <thead>
          <tr><th>Case</th><th>Pixel default</th><th>ERP Enterprise</th><th>Rule</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r[0]">
            <td>{{ r[0] }}</td>
            <td>{{ r[1] }}</td>
            <td>{{ r[2] }}</td>
            <td>{{ r[3] }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
<style scoped>
.pxpagetitle { font-size: var(--mp-font-sizes-xl, 1.5rem); font-weight: var(--mp-font-weights-semi-bold); margin-bottom: var(--mp-spacing-4); }
.ov-scroll { overflow-x: auto; scrollbar-width: thin; scrollbar-color: #c3c9ca #f1f5f9; }
.ov-scroll::-webkit-scrollbar { height: 8px; }
.ov-scroll::-webkit-scrollbar-thumb { background: #c3c9ca; border-radius: 999px; border: 2px solid #f1f5f9; }
.ov-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
/* proper ERP table look: 28px UPPERCASE gray header, row borders, 14px text-default */
.ovtbl { width: 100%; min-width: 720px; border-collapse: collapse; table-layout: fixed; font-size: var(--mp-font-sizes-md, 0.875rem); }
.ovtbl th {
  text-align: left; height: var(--mp-sizes-7, 28px); padding: 4px 16px 4px 8px;
  font-size: var(--mp-font-sizes-sm, 0.75rem); font-weight: var(--mp-font-weights-semi-bold, 600);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-colors-text-secondary, #3a4749);
  background: #f1f5f9; border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); white-space: nowrap;
}
.ovtbl td {
  padding: 10px 16px 10px 8px; border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9);
  color: var(--mp-colors-text-default, #080d0e); vertical-align: top;
}
</style>
