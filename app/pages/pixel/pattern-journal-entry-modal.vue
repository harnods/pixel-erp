<script setup lang="ts">
import { ref } from 'vue'
import JournalEntryDrawer, { type JournalEntryRow } from '~/components/patterns/JournalEntryDrawer.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Journal entry modal · Pixel 3 Enterprise' })

// Read-only Account / Debit / Credit rows, a balanced double-entry posting.
// Account ALWAYS leads with its account number (chart-of-accounts code).
const rows: JournalEntryRow[] = [
  { account: '1-10300 Inventory - Furniture', debit: 13_500_000 },
  { account: '1-10400 VAT In (PPN Masukan)', debit: 1_485_000 },
  { account: '2-10000 Accounts Payable - PT Kayu Jati', credit: 14_985_000 },
]

const open = ref(false)

// A long posting (20 balanced debit/credit lines) to demonstrate the
// internal scroll past ~420px (sticky header + sticky Total row stay in view).
const longRows: JournalEntryRow[] = []
for (let i = 0; i < 10; i++) {
  const amount = 500_000 + i * 125_000
  longRows.push({ account: `1-10${300 + i} Inventory - Batch ${i + 1}`, debit: amount })
  longRows.push({ account: `2-10${300 + i} Accounts Payable - Vendor ${i + 1}`, credit: amount })
}
const openLong = ref(false)
</script>

<template>
  <div>
    <DemoHeader title="Journal entry modal" tag="pattern · detail page"
      lead="The read-only double-entry posting behind a transaction. Shown from a 'View journal entry' link on a detail page (bills, transfers, invoices …). One shared component, JournalEntryDrawer.vue (an MpModal size lg, despite the legacy filename), takes a heading + Account/Debit/Credit rows and always closes with a balancing Total row. Generic on purpose: pass any transaction's rows, never fork it per type."
      :rules="['rule/journal-entry-modal', 'rule/journal-entry-structure', 'rule/journal-entry-trigger', 'rule/modal-use-mpmodal']" />

    <DemoSection title="Trigger: 'View journal entry' link"
      desc="Opened from the 'View journal entry' text link on the detail page (often inside the posting banner). Bound with v-model:is-open. No toolbar button."
      :rules="['rule/journal-entry-trigger']"
      code="<a class=&quot;detail-banner-link&quot; @click.prevent=&quot;showJournalEntry = true&quot;>View journal entry</a>

<JournalEntryDrawer
  v-model:is-open=&quot;showJournalEntry&quot;
  :heading=&quot;`Expense #${no}`&quot;
  :rows=&quot;journalEntryRows&quot; />">
      <a class="je-link" @click.prevent="open = true">View journal entry →</a>
    </DemoSection>

    <DemoSection title="Structure: Account · Debit · Credit + Total"
      desc="Body = a heading (the source document) then a fixed 3-column table: Account (flex) + right-aligned Debit + Credit (180px each), and a bold-bordered Total row summing each side. The Account cell ALWAYS leads with its account number (chart-of-accounts code) then the name. Read-only; empty cells stay blank, amounts use IDR. Debits must equal credits; the Total row is where you eyeball that."
      :rules="['rule/journal-entry-structure', 'rule/table-header-uppercase']"
      code="const rows: JournalEntryRow[] = [   // account ALWAYS leads with its account no.
  { account: '1-10300 Inventory - Furniture', debit: 13_500_000 },
  { account: '1-10400 VAT In (PPN Masukan)',  debit: 1_485_000 },
  { account: '2-10000 Accounts Payable',      credit: 14_985_000 },
]  // Total row sums debit & credit; they must balance.">
      <a class="je-link" @click.prevent="open = true">Open the modal to see the table →</a>
    </DemoSection>

    <DemoSection title="Long posting: internal scroll past ~420px"
      desc="20 balanced debit/credit lines. Past the 420px max-height, the row list scrolls internally while the UPPERCASE header and the bold-bordered Total row both stay pinned in view (sticky), so the columns and the running balance are always visible."
      :rules="['rule/journal-entry-structure']"
      code="const longRows: JournalEntryRow[] = []
for (let i = 0; i < 10; i++) {
  const amount = 500_000 + i * 125_000
  longRows.push({ account: `1-10${300 + i} Inventory - Batch ${i + 1}`, debit: amount })
  longRows.push({ account: `2-10${300 + i} Accounts Payable - Vendor ${i + 1}`, credit: amount })
}">
      <a class="je-link" @click.prevent="openLong = true">Open a 20-line posting →</a>
    </DemoSection>

    <JournalEntryDrawer v-model:is-open="open" heading="Expense #00042" :rows="rows" />
    <JournalEntryDrawer v-model:is-open="openLong" heading="Purchase Invoice #00118" :rows="longRows" />
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
