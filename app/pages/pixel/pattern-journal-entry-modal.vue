<script setup lang="ts">
import { ref } from 'vue'
import JournalEntryDrawer, { type JournalEntryRow } from '~/components/patterns/JournalEntryDrawer.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Journal entry modal · Pixel 3 Enterprise' })

// Read-only Account / Debit / Credit rows — a balanced double-entry posting.
const rows: JournalEntryRow[] = [
  { account: 'Inventory — Furniture', debit: 13_500_000 },
  { account: 'VAT In (PPN Masukan)', debit: 1_485_000 },
  { account: 'Accounts Payable — PT Kayu Jati', credit: 14_985_000 },
]

const open = ref(false)
</script>

<template>
  <div>
    <DemoHeader title="Journal entry modal" tag="pattern · detail page"
      lead="The read-only double-entry posting behind a transaction. Shown from a 'View journal entry' link on a detail page (bills, transfers, invoices …). One shared component — JournalEntryDrawer.vue (an MpModal size lg, despite the legacy filename) — takes a heading + Account/Debit/Credit rows and always closes with a balancing Total row. Generic on purpose: pass any transaction's rows, never fork it per type."
      :rules="['rule/journal-entry-modal', 'rule/journal-entry-structure', 'rule/journal-entry-trigger', 'rule/modal-use-mpmodal']" />

    <DemoSection title="Trigger — 'View journal entry' link"
      desc="Opened from the 'View journal entry' text link on the detail page (often inside the posting banner). Bound with v-model:is-open. No toolbar button."
      :rules="['rule/journal-entry-trigger']"
      code="<a class=&quot;detail-banner-link&quot; @click.prevent=&quot;showJournalEntry = true&quot;>View journal entry</a>

<JournalEntryDrawer
  v-model:is-open=&quot;showJournalEntry&quot;
  :heading=&quot;`Expense #${no}`&quot;
  :rows=&quot;journalEntryRows&quot; />">
      <a class="je-link" @click.prevent="open = true">View journal entry →</a>
    </DemoSection>

    <DemoSection title="Structure — Account · Debit · Credit + Total"
      desc="Body = a heading (the source document) then a fixed 3-column table: Account (flex) + right-aligned Debit + Credit (180px each), and a bold-bordered Total row summing each side. Read-only; empty cells stay blank, amounts use IDR. Debits must equal credits — the Total row is where you eyeball that."
      :rules="['rule/journal-entry-structure', 'rule/table-header-uppercase']"
      code="const rows: JournalEntryRow[] = [
  { account: 'Inventory — Furniture', debit: 13_500_000 },
  { account: 'VAT In (PPN Masukan)',  debit: 1_485_000 },
  { account: 'Accounts Payable',      credit: 14_985_000 },
]  // Total row sums debit & credit — they must balance.">
      <a class="je-link" @click.prevent="open = true">Open the modal to see the table →</a>
    </DemoSection>

    <JournalEntryDrawer v-model:is-open="open" heading="Expense #00042" :rows="rows" />
  </div>
</template>

<style scoped>
.je-link {
  display: inline-block;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.je-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
