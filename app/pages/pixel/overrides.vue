<script setup lang="ts">
import { MpTable, MpTableContainer, MpTableHead, MpTableBody, MpTableRow, MpTableCell } from '@mekari/pixel3'
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
    <div class="pxtable">
      <MpTableContainer>
        <MpTable>
          <MpTableHead>
            <MpTableRow>
              <MpTableCell>Case</MpTableCell>
              <MpTableCell>Pixel default</MpTableCell>
              <MpTableCell>ERP Enterprise</MpTableCell>
              <MpTableCell>Rule</MpTableCell>
            </MpTableRow>
          </MpTableHead>
          <MpTableBody>
            <MpTableRow v-for="r in rows" :key="r[0]">
              <MpTableCell>{{ r[0] }}</MpTableCell>
              <MpTableCell>{{ r[1] }}</MpTableCell>
              <MpTableCell>{{ r[2] }}</MpTableCell>
              <MpTableCell>{{ r[3] }}</MpTableCell>
            </MpTableRow>
          </MpTableBody>
        </MpTable>
      </MpTableContainer>
    </div>
  </div>
</template>
<style scoped>
.pxpagetitle { font-size: var(--mp-font-sizes-xl, 1.5rem); font-weight: var(--mp-font-weights-semi-bold); margin-bottom: var(--mp-spacing-4); }
.pxtable { overflow-x: auto; }
</style>
