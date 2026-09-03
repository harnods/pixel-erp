<script setup lang="ts">
import { MpBadge, MpTable, MpTableContainer, MpTableHead, MpTableBody, MpTableRow, MpTableCell } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Table · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Table" tag="MpTable"
    override="For real list pages use ErpTablePage + useTableState — never hand-roll."
    :rules="['rule/table-use-erptablepage', 'rule/table-column-kind']">
    <MpTableContainer>
      <MpTable>
        <MpTableHead>
          <MpTableRow>
            <MpTableCell>Number</MpTableCell>
            <MpTableCell>Vendor</MpTableCell>
            <MpTableCell>Status</MpTableCell>
          </MpTableRow>
        </MpTableHead>
        <MpTableBody>
          <MpTableRow>
            <MpTableCell>PO-001</MpTableCell>
            <MpTableCell>PT Maju</MpTableCell>
            <MpTableCell><MpBadge for="tableStatus" type="completed" size="sm">Paid</MpBadge></MpTableCell>
          </MpTableRow>
        </MpTableBody>
      </MpTable>
    </MpTableContainer>
  </DemoCard>
</template>
