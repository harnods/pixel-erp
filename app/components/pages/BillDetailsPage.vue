<script setup lang="ts">
import { ref, computed } from 'vue'
import { MpButton, MpIcon, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { bills } from '~/data/bills'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const bill = computed(() => bills.find((b) => b.id === props.orderId) ?? null)

// Info banner — shows once a paid bill's payment has been reconciled against a
// bank transaction (see bill.reconciled in ~/data/bills.ts).
const showBanner = computed(() => !!bill.value?.reconciled)

// Paid bills never show a due date and are always simply "Paid"; only an
// unpaid bill's due date can put it into "Open" vs "Overdue".
const isOverdue = computed(() => !!bill.value && bill.value.status === 'unpaid' && new Date(bill.value.dueDate).getTime() < Date.now())
const displayStatus = computed(() => {
  if (!bill.value) return 'unpaid'
  if (bill.value.status === 'paid') return 'paid'
  return isOverdue.value ? 'overdue' : 'open'
})
// Payment tab: always present for a bill created already-paid; for a bill
// created unpaid it only appears once a payment has actually been added.
const showPaymentTab = computed(() => bill.value?.status === 'paid' || !!bill.value?.payment)

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(amount)
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}
function attachmentIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image-document'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'attachment'
}

function goExpenses() {
  router.push({ path: '/expenses', query: { tab: 'Bills' } })
}
</script>

<template>
  <div v-if="bill" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goExpenses">Expenses</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Expense #{{ String(bill.number).padStart(5, '0') }}</h1>
          <ErpStatusBadge :status="displayStatus" size="md" badge-for="additionalInformation" />
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Info banner (conditional) — temporarily hidden in the prototype -->
      <div v-if="showBanner" class="detail-banner">
        <svg class="detail-banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span class="detail-banner-text">Transaction has been reconciled.</span>
        <a class="detail-banner-link" @click.prevent>View details</a>
      </div>

      <!-- Beneficiary + Total — separated section, inline together -->
      <section class="bd-primary">
        <ContentList label="Beneficiary" :value="bill.beneficiary.name" />
        <div class="detail-primary-total">
          <span class="detail-total-label">Total</span>
          <span class="detail-total-amount">{{ formatIDR(bill.total) }}</span>
          <a class="detail-banner-link bd-journal-link" @click.prevent>View journal entry</a>
        </div>
      </section>

      <!-- Meta grid: col 1 = 318px, col 2-4 fill equally -->
      <section class="bd-meta content-list-grid">
        <div class="content-list-col">
          <ContentList label="Transaction date" :value="formatDate(bill.date)" />
          <ContentList v-if="bill.status !== 'paid'" label="Due date" :value="formatDate(bill.dueDate)" />
        </div>
        <div class="content-list-col">
          <ContentList label="Transaction no." :value="`Expense #${String(bill.number).padStart(5, '0')}`" />
          <ContentList label="Reference no." value="—" />
        </div>
        <div class="content-list-col">
          <ContentList label="Category" :value="bill.category" />
        </div>
        <div class="content-list-col">
          <ContentList label="Tags">
            <span v-if="bill.tags?.length">{{ bill.tags.join(', ') }}</span>
            <template v-else>—</template>
          </ContentList>
        </div>
      </section>

      <!-- ── Line items — canonical detail-page table pattern ── -->
      <section class="detail-items-section">
        <table class="detail-items">
          <thead>
            <tr>
              <th class="detail-th">Account</th>
              <th class="detail-th">Description</th>
              <th class="detail-th">Tax</th>
              <th class="detail-th detail-th--num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!bill.lineItems?.length">
              <td class="detail-td detail-td--muted" colspan="4">No line items.</td>
            </tr>
            <tr v-for="(li, i) in bill.lineItems" :key="i" class="detail-item-row">
              <td class="detail-td">{{ li.account }}</td>
              <td class="detail-td">{{ li.description || '—' }}</td>
              <td class="detail-td">{{ li.tax }}</td>
              <td class="detail-td detail-td--num">{{ formatIDR(li.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="bill.lineItems?.length" class="detail-items-count">
          <span>Showing {{ bill.lineItems.length }} of {{ bill.lineItems.length }} line items</span>
        </div>
      </section>

      <!-- ── Notes + totals ── -->
      <section class="detail-notes">
        <div class="detail-notes-left">
          <ContentList label="Memo">
            <p class="detail-note-text">{{ bill.memo || '—' }}</p>
          </ContentList>
          <ContentList :label="`Attachment (${bill.attachments?.length ?? 0})`">
            <div v-if="bill.attachments?.length" class="detail-attach-list">
              <a
                v-for="(a, i) in bill.attachments" :key="i" class="detail-attach"
                :href="a.url" target="_blank" rel="noopener"
              >
                <span class="detail-attach-icon"><MpIcon :name="attachmentIcon(a.name)" size="md" /></span>
                <span class="detail-attach-meta">
                  <span class="detail-attach-name">{{ a.name }}</span>
                  <span class="detail-attach-size">{{ a.sizeKB.toFixed(1) }} KB</span>
                </span>
              </a>
            </div>
            <template v-else>—</template>
          </ContentList>
        </div>
        <div class="detail-totals">
          <div class="detail-total-row">
            <span class="detail-total-row-label">Subtotal</span>
            <span class="detail-total-row-amt">{{ formatIDR(bill.subtotal ?? bill.total) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">PPN 10%</span>
            <span class="detail-total-row-amt">{{ formatIDR(bill.taxAmount ?? 0) }}</span>
          </div>
          <div class="detail-total-rule" />
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--total">Total</span>
            <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(bill.total) }}</span>
          </div>
        </div>
      </section>

      <!-- ── Payment tab — same spacing/style as the detail page's tab pattern ── -->
      <MpTabs v-if="showPaymentTab" id="bd-tabs" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="bd-tab-payment" value="payment">Payment</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel value="payment">
            <h3 class="detail-tab-heading">Transactions</h3>
            <table class="detail-payment">
              <thead>
                <tr>
                  <th class="detail-th">Payment account</th>
                  <th class="detail-th detail-th--num">Amount paid</th>
                  <th class="detail-th">Payment date</th>
                  <th class="detail-th">Reference</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!bill.payment">
                  <td class="detail-td detail-td--muted" colspan="4">No payment recorded.</td>
                </tr>
                <tr v-else class="detail-item-row">
                  <td class="detail-td">{{ bill.payment.paymentAccount }}</td>
                  <td class="detail-td detail-td--num">{{ formatIDR(bill.payment.amountPaid) }}</td>
                  <td class="detail-td">{{ formatDate(bill.payment.paymentDate) }}</td>
                  <td class="detail-td">{{ bill.payment.reference || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer">
      <MpButton variant="secondary" is-rounded>Print PDF</MpButton>
      <MpButton variant="primary" is-rounded>Action</MpButton>
    </footer>
  </div>

  <!-- Not found fallback -->
  <div v-else class="bd-not-found">
    <p>Expense not found.</p>
    <button class="detail-breadcrumb" @click="goExpenses">Back to Expenses</button>
  </div>
</template>

<style scoped>
/* ── Page shell — canonical detail pattern ──────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
  container-type: inline-size;
}

/* ── Info banner (same pattern as SalesOrderDetailsPage) ─────────────────── */
.detail-banner {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-information, #e8f1ff);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.detail-banner-icon { color: var(--mp-icon-information, #1d6fdc); flex-shrink: 0; }
.detail-banner-text { flex: 1; }
.detail-banner-link { color: var(--mp-text-link); cursor: pointer; font-weight: var(--mp-font-weights-semi-bold); }
.detail-banner-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Beneficiary + Total (separated section, inline) ─────────────────────── */
.bd-primary { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-primary-total { display: flex; flex-direction: column; align-items: flex-end; gap: var(--mp-spacing-1); }
.detail-total-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-total-amount { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bd-journal-link { font-size: var(--mp-font-sizes-sm); }

/* ── Meta grid: col 1 = 318px, col 2-4 fill equally, 24px gap ────────────── */
.content-list-grid {
  display: grid;
  grid-template-columns: minmax(0, 318px) repeat(3, minmax(0, 1fr));
  gap: 0 var(--mp-spacing-6);
}
.content-list-col { display: flex; flex-direction: column; }
.bd-meta { padding-top: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }

/* ── Line items — canonical detail-page table pattern ────────────────────── */
.detail-items-section { display: flex; flex-direction: column; }
.detail-items, .detail-payment { width: 100%; border-collapse: collapse; }
.detail-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.detail-td--muted { color: var(--mp-text-secondary); text-align: center; }
.detail-item-row:last-child .detail-td { border-bottom: none; }
.detail-items-count { padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Notes + totals ───────────────────────────────────────────────────────── */
/* Stacked by default (both blocks capped at the 318px "4-column" unit, matching the
   meta grid's col-1 / Beneficiary field). Inline once the stage is wide enough: reuses
   the exact .content-list-grid column template so the totals block spans the same
   3 columns (col 2-4) as the rest of the meta grid, scaling with the page instead of
   staying pinned to a fixed px width on full-screen/wide viewports. */
.detail-notes { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.detail-notes-left { display: flex; flex-direction: column; gap: var(--mp-spacing-6); width: 318px; flex-shrink: 0; }
.detail-note-text {
  margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default); white-space: pre-line;
}
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; width: fit-content; }
.detail-attach-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }
.detail-attach-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); width: 320px; flex-shrink: 0; padding-top: var(--mp-spacing-2); }
/* Inline layout: reuse the exact .content-list-grid column template so the totals block
   spans the same 3 columns (col 2-4) as the meta grid, scaling with the page instead of
   staying pinned to a fixed px width on full-screen/wide viewports. */
@container (min-width: 700px) {
  .detail-notes { display: grid; grid-template-columns: minmax(0, 318px) repeat(3, minmax(0, 1fr)); gap: 0 var(--mp-spacing-6); }
  .detail-notes-left { grid-column: 1; width: auto; }
  .detail-totals { grid-column: 2 / -1; width: auto; max-width: none; }
}
.detail-total-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-total-row-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-total-row-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.detail-total-row-label--total, .detail-total-row-amt--total {
  font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.detail-total-rule { border-top: 1px solid var(--mp-border-default); }

/* ── Payment tab — same spacing/style as SalesOrderDetailsPage's tab pattern ── */
.detail-tabs { margin-top: 0; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.detail-tab-heading {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage);
  border-top: 1px solid var(--mp-border-default);
}

.bd-not-found { padding: var(--mp-spacing-6); }
</style>
