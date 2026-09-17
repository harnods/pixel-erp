<script setup lang="ts">
/**
 * "Matched details" drawer — shown from the bill detail reconciliation banner's
 * "View details" link. Read-only two-column reconciliation view: the bank
 * statement line(s) on the left vs the matched transaction(s) on the right,
 * each with its own running total. Figma: node 7277:146534, "Drawer / Matched Details".
 */
import { MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay, MpIcon, MpButton } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import type { Bill } from '~/data/types'
import { formatDate } from '~/utils/date'

const props = defineProps<{ isOpen: boolean; bill: Bill }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'unmatch'): void
}>()

function debit(amount: number) {
  return `(${formatIDR(amount)})`
}

function close() { emit('update:isOpen', false) }
function unmatch() { emit('unmatch'); close() }
</script>

<template>
  <MpDrawer :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="matched-details-drawer"
    :is-open="isOpen"
    placement="right"
    size="2xl"
    variant="floating"
    :is-keep-alive="false"
    @close="close"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="mdd-card">
          <div class="mdd-header">
            <span class="mdd-title">Matched details</span>
            <MpButton class="mdd-close" aria-label="Close" @click="close">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </div>

          <div class="mdd-content">
            <div class="mdd-section">
              <div class="mdd-section-heading">
                <span class="mdd-section-title">Bank statement lines</span>
                <span class="mdd-section-count">1 line</span>
              </div>
              <table class="mdd-table">
                <colgroup>
                  <col class="mdd-col-date" />
                  <col />
                  <col class="mdd-col-amount" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="mdd-th">Date</th>
                    <th class="mdd-th">Description</th>
                    <th class="mdd-th mdd-th--num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="mdd-row">
                    <td class="mdd-td">{{ formatDate(bill.payment?.paymentDate) }}</td>
                    <td class="mdd-td">
                      <span class="mdd-td-main">{{ bill.payment?.reference || 'Bank transaction' }}</span>
                      <span class="mdd-td-sub">{{ bill.payment?.paymentAccount }}</span>
                    </td>
                    <td class="mdd-td mdd-td--num">{{ debit(bill.payment?.amountPaid ?? bill.total) }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="mdd-total-row">
                    <td class="mdd-td mdd-td--total">Total</td>
                    <td class="mdd-td"></td>
                    <td class="mdd-td mdd-td--num mdd-td--total">{{ debit(bill.payment?.amountPaid ?? bill.total) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div class="mdd-section">
              <div class="mdd-section-heading">
                <span class="mdd-section-title">Matched transactions</span>
                <span class="mdd-section-count">1 line</span>
              </div>
              <table class="mdd-table">
                <colgroup>
                  <col class="mdd-col-date" />
                  <col />
                  <col class="mdd-col-amount" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="mdd-th">Date</th>
                    <th class="mdd-th">Number</th>
                    <th class="mdd-th mdd-th--num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="mdd-row">
                    <td class="mdd-td">{{ formatDate(bill.date) }}</td>
                    <td class="mdd-td">
                      <span class="mdd-td-main">Expense #{{ String(bill.number).padStart(5, '0') }}</span>
                      <span class="mdd-td-sub">{{ bill.category }}</span>
                    </td>
                    <td class="mdd-td mdd-td--num">{{ debit(bill.total) }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="mdd-total-row">
                    <td class="mdd-td mdd-td--total">Total</td>
                    <td class="mdd-td"></td>
                    <td class="mdd-td mdd-td--num mdd-td--total">{{ debit(bill.total) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div class="mdd-footer">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="close">Cancel</button>
            <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="unmatch">Unmatch</button>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* Floating drawer: MpDrawerBody is the rounded white card (no built-in padding),
   so the card owns header / scrollable content / pinned footer. */
.mdd-card { display: flex; flex-direction: column; height: 100%; width: 1140px; max-width: 90vw; }
.mdd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.mdd-close { display: inline-flex !important; background: none !important; border: none !important; padding: var(--mp-spacing-1) !important; min-width: 0 !important; cursor: pointer; color: var(--mp-text-secondary); }
.mdd-close:hover { color: var(--mp-text-default); }

.mdd-content { flex: 1; overflow: auto; display: flex; gap: 80px; padding: var(--mp-spacing-4); }
.mdd-section { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.mdd-section-heading { display: flex; flex-direction: column; }
.mdd-section-title { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.mdd-section-count { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.mdd-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
.mdd-col-date { width: 90px; }
.mdd-col-amount { width: 140px; }
.mdd-th { height: 28px; text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-surface, #f1f5f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mdd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.mdd-td {
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-lg, 20px); vertical-align: top;
}
.mdd-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.mdd-td-main { display: block; }
.mdd-td-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mdd-row .mdd-td { border-bottom: 1px solid var(--mp-border-default); padding-bottom: var(--mp-spacing-4); }
.mdd-total-row .mdd-td { border-top: 1px solid var(--mp-border-bold, #758195); }
.mdd-td--total { font-weight: var(--mp-font-weights-semi-bold); }

.mdd-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default);
}
</style>
