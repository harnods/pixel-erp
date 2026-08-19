<script setup lang="ts">
/**
 * "Journal entry" modal — shown from a "View journal entry" link. Read-only,
 * single Account/Debit/Credit table with a balancing Total row. Generic: takes
 * a heading + a list of rows so any transaction type can reuse it, not just bills.
 */
import { MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalOverlay, MpModalCloseButton } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'

export interface JournalEntryRow {
  account: string
  debit?: number
  credit?: number
}

const props = defineProps<{ isOpen: boolean; heading: string; rows: JournalEntryRow[] }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()

const totalDebit = computed(() => props.rows.reduce((s, r) => s + (r.debit ?? 0), 0))
const totalCredit = computed(() => props.rows.reduce((s, r) => s + (r.credit ?? 0), 0))

function close() { emit('update:isOpen', false) }
</script>

<template>
  <MpModal
    id="journal-entry-modal"
    :is-open="isOpen"
    size="lg"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>
        Journal entry
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <h3 class="jed-heading">{{ heading }}</h3>
        <table class="jed-table">
          <colgroup>
            <col />
            <col class="jed-col-num" />
            <col class="jed-col-num" />
          </colgroup>
          <thead>
            <tr>
              <th class="jed-th">Account</th>
              <th class="jed-th jed-th--num">Debit</th>
              <th class="jed-th jed-th--num">Credit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="i" class="jed-row">
              <td class="jed-td">{{ row.account }}</td>
              <td class="jed-td jed-td--num">{{ row.debit ? formatIDR(row.debit) : '' }}</td>
              <td class="jed-td jed-td--num">{{ row.credit ? formatIDR(row.credit) : '' }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="jed-total-row">
              <td class="jed-td jed-td--total-label">Total</td>
              <td class="jed-td jed-td--num">{{ formatIDR(totalDebit) }}</td>
              <td class="jed-td jed-td--num">{{ formatIDR(totalCredit) }}</td>
            </tr>
          </tfoot>
        </table>
      </MpModalBody>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.jed-heading { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.jed-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
.jed-col-num { width: 180px; }
.jed-th { height: 28px; text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-surface, #f1f5f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); text-transform: uppercase; white-space: nowrap;
}
.jed-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.jed-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-lg, 20px);
}
.jed-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4); }
.jed-row .jed-td { border-bottom: 1px solid var(--mp-border-default); }
.jed-row:last-child .jed-td { border-bottom: 1px solid var(--mp-border-bold, #758195); }
.jed-total-row .jed-td {
  border-top: 1px solid var(--mp-border-bold, #758195);
  border-bottom: 1px solid var(--mp-border-bold, #758195);
}
.jed-td--total-label { font-weight: var(--mp-font-weights-semi-bold); }

:deep(.mp-modal__body) { padding-bottom: 40px; }
:deep(.mp-modal__header) { padding: 12px 16px; }
</style>
