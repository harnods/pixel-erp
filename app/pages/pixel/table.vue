<script setup lang="ts">
import { MpBadge, MpTable, MpTableContainer, MpTableHead, MpTableBody, MpTableRow, MpTableCell } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Table · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Table" tag="MpTable" override="For real list pages use ErpTablePage + useTableState."
      lead="The raw Pixel table primitives. For any index/list page do NOT hand-roll this — use ErpTablePage (column-width standard, sorting, pagination)."
      :rules="['rule/table-use-erptablepage', 'rule/table-column-kind']" />
    <DemoSection title="Basic"
      desc="Container > Table > Head/Body > Row > Cell."
      :rules="['rule/table-use-erptablepage']"
      code="<MpTableContainer><MpTable>
  <MpTableHead><MpTableRow><MpTableCell>Number</MpTableCell>…</MpTableRow></MpTableHead>
  <MpTableBody><MpTableRow><MpTableCell>PO-001</MpTableCell>…</MpTableRow></MpTableBody>
</MpTable></MpTableContainer>">
      <MpTableContainer>
        <MpTable>
          <MpTableHead>
            <MpTableRow><MpTableCell>Number</MpTableCell><MpTableCell>Vendor</MpTableCell><MpTableCell>Status</MpTableCell></MpTableRow>
          </MpTableHead>
          <MpTableBody>
            <MpTableRow><MpTableCell>PO-001</MpTableCell><MpTableCell>PT Maju</MpTableCell><MpTableCell><MpBadge for="tableStatus" type="completed" size="sm">Paid</MpBadge></MpTableCell></MpTableRow>
            <MpTableRow><MpTableCell>PO-002</MpTableCell><MpTableCell>CV Sinar</MpTableCell><MpTableCell><MpBadge for="tableStatus" type="warning" size="sm">Pending</MpBadge></MpTableCell></MpTableRow>
          </MpTableBody>
        </MpTable>
      </MpTableContainer>
    </DemoSection>
  </div>
</template>
