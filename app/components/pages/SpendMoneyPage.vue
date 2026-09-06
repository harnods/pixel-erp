<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpButton, MpInput, MpAutocomplete, MpDatePicker, MpInputTag, MpTextarea, MpUpload, MpUploadList,
  MpIcon, MpFormControl, MpFormLabel, MpFormErrorMessage, MpTextlink, toast,
  type DataInterface,
} from '@mekari/pixel3'
import { bills } from '~/data/bills'
import type { Bill } from '~/data/types'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import ErpDimensionTagUpsell from '~/components/patterns/ErpDimensionTagUpsell.vue'
import ErpLineDimensionsCell from '~/components/patterns/ErpLineDimensionsCell.vue'
import { applicableDimensions } from '~/data/dimensions'

// orderId = the unpaid bill the "Add payment" action was launched from — this
// page always exists in the context of settling that bill (Payee is derived
// from it and it's always the table's first, locked row).
const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

function billLabel(b: Bill) {
  return `${t('Expense')} #${String(b.number).padStart(5, '0')}`
}

const sourceBill = computed(() => bills.find((b) => b.id === props.orderId) ?? null)

function goBackToExpense() {
  if (sourceBill.value) router.push(`/expenses/${sourceBill.value.id}`)
  else router.push({ path: '/expenses', query: { tab: 'Bills' } })
}

// ── Pay from / Payee — Payee is fixed to the source bill's beneficiary, not editable ──
const BANK_ACCOUNT_OPTIONS = [
  { id: '1-10003', name: '1-10003 Bank BCA' },
  { id: '1-10004', name: '1-10004 VISA 8265' },
]
const payFromId = ref('')
const payFromError = ref(false)
const payeeName = computed(() => sourceBill.value?.beneficiary.name ?? '')

// ── Header fields ────────────────────────────────────────────────────────────
const transactionDate = ref(todayDisplay)
const transactionNo = ref('')
const referenceNo = ref('')
const tags = ref<DataInterface[]>([])
function onTagsChange(data: DataInterface[]) { tags.value = data }

// ── Transaction no. settings (auto-numbering) — shared global component ────────
const noSettingsOpen = ref(false)
const nextTxNo = computed(() => `TRX-${String(bills.reduce((m, b) => { const r = Number((b.payment?.reference || '').replace(/\D/g, '')) || 0; return Math.max(m, r) }, 0) + 1).padStart(6, '0')}`)
const txNoFormats = [{ label: t('Auto'), value: 'auto' }]
function onNoFormatSave(_config: NumberFormatConfig) { noSettingsOpen.value = false }

// ── Line items — one row per unpaid bill owed to this payee. The source bill is
// always first and locked (can't be removed), amount prefilled to its balance
// due — the full amount this payment is expected to settle. Any other unpaid
// bills for the same payee are listed too, amount left blank (optional to pay
// down in the same transaction). ──
// Spend money posts against the Expenses module, so it takes the same
// line-level Dimensions column as the other transaction forms — shown the
// moment a dimension in Settings > Dimensions covers "Expenses".
const { dimensionsActivated } = useDimensionsActivation()
const showDimensionsColumn = computed(() => dimensionsActivated.value && applicableDimensions('expenses').length > 0)

interface PaymentRow {
  id: number
  billId: string
  billLabel: string
  description: string
  balanceDue: number
  total: number
  amount: string
  removable: boolean
  /** dimension id → chosen value, for the line-level Dimensions column. */
  dimensions: Record<string, string>
}
let rowSeq = 0
function makeRow(b: Bill, amount: string, removable: boolean): PaymentRow {
  return { id: rowSeq++, billId: b.id, billLabel: billLabel(b), description: '', balanceDue: b.balanceDue, total: b.total, amount, removable, dimensions: {} }
}
function buildInitialRows(): PaymentRow[] {
  const b = sourceBill.value
  if (!b) return []
  const siblings = bills.filter((x) => x.beneficiary.id === b.beneficiary.id && x.status === 'unpaid' && x.id !== b.id)
  return [makeRow(b, String(b.balanceDue), false), ...siblings.map((s) => makeRow(s, '', true))]
}
const rows = ref<PaymentRow[]>(buildInitialRows())

// "Select expense" trailing row — lets the user add another of this payee's
// unpaid bills that isn't already in the table.
const availableExpenseOptions = computed(() => {
  const b = sourceBill.value
  if (!b) return []
  const usedIds = new Set(rows.value.map((r) => r.billId))
  return bills
    .filter((x) => x.beneficiary.id === b.beneficiary.id && x.status === 'unpaid' && !usedIds.has(x.id))
    .map((x) => ({ id: x.id, name: billLabel(x) }))
})
const selectedExpenseToAdd = ref('')
function onAddExpenseRow(id: string) {
  const b = bills.find((x) => x.id === id)
  if (!b) return
  rows.value.push(makeRow(b, '', true))
  selectedExpenseToAdd.value = ''
}
function removeRow(id: number) {
  const row = rows.value.find((r) => r.id === id)
  if (!row?.removable) return
  rows.value = rows.value.filter((r) => r.id !== id)
}

const totalAmount = computed(() => rows.value.reduce((s, r) => s + (Number(r.amount) || 0), 0))

// ── Message / Memo / Attachment — not tied to any bill field, same as several
// other cosmetic-only fields already in this app (e.g. BillDetailsPage's
// Reference no. row). ──
const message = ref('')
const memo = ref('')
const attachedFiles = ref<File[]>([])
function onAttachmentChange(files: FileList | null) {
  if (!files) return
  for (const f of Array.from(files)) {
    if (!attachedFiles.value.some((x) => x.name === f.name)) attachedFiles.value.push(f)
  }
}
function removeAttachedFile(name: string) {
  attachedFiles.value = attachedFiles.value.filter((f) => f.name !== name)
}
function fileIconName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'doc' || ext === 'docx') return 'word-document'
  if (ext === 'xls' || ext === 'xlsx') return 'excel-document'
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image-document'
  if (ext === 'zip') return 'zip'
  return 'doc'
}

// ── Save — every row with an amount > 0 gets fully settled: this app has no
// partial-payment tracking (every existing "paid" bill already carries
// balanceDue: 0), so a nonzero amount here means that bill is now paid in full. ──
function handleSave() {
  if (!payFromId.value) { payFromError.value = true; return }
  const accountName = BANK_ACCOUNT_OPTIONS.find((a) => a.id === payFromId.value)?.name ?? payFromId.value
  const paymentDateISO = toISODate(transactionDate.value)

  for (const row of rows.value) {
    const amt = Number(row.amount) || 0
    if (amt <= 0) continue
    const b = bills.find((x) => x.id === row.billId)
    if (!b) continue
    b.payment = { paymentAccount: accountName, amountPaid: amt, paymentDate: paymentDateISO, reference: referenceNo.value || undefined }
    b.balanceDue = 0
    b.status = 'paid'
  }

  toast.notify({ variant: 'success', title: t('Payment saved') })
  goBackToExpense()
}
</script>

<template>
  <div v-if="sourceBill" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <span class="detail-breadcrumb detail-breadcrumb--static">{{ t('Cash management') }}</span>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('New spend money') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Single-panel stage ── -->
    <div class="ex-stage sm-stage">
      <div class="ex-right sm-right">

        <!-- Pay from / Payee + Total — always inline (flex row, not the grid below) -->
        <div class="ex-row-1">
          <MpFormControl id="sm-payfrom" class="ex-field-flex" :is-invalid="payFromError">
            <MpFormLabel>{{ t('Pay from') }}</MpFormLabel>
            <MpAutocomplete
              id="sm-payfrom-ac"
              v-model="payFromId"
              :data="BANK_ACCOUNT_OPTIONS"
              label-prop="name" value-prop="id"
              is-searchable is-clearable use-portal is-full-width
              :is-invalid="payFromError"
              @update:model-value="payFromError = false"
            />
            <MpFormErrorMessage>{{ t('You must select pay from') }}</MpFormErrorMessage>
          </MpFormControl>
          <MpFormControl id="sm-payee" class="ex-field-flex">
            <MpFormLabel>{{ t('Payee') }}</MpFormLabel>
            <MpInput id="sm-payee-input" :model-value="payeeName" is-full-width is-disabled />
          </MpFormControl>
          <div class="sm-total">
            <span class="detail-total-amount">
              <span class="detail-total-label">{{ t('Total') }}</span> {{ formatIDR(totalAmount) }}
            </span>
          </div>
        </div>

        <!-- Transaction date / Transaction no. / Reference no. / Tags -->
        <div class="ex-grid-2">
          <MpFormControl id="sm-txdate">
            <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
            <div class="ex-datepicker">
              <MpDatePicker id="sm-txdate-dp" v-model="transactionDate" format="DD/MM/YYYY" value-type="format" use-portal />
            </div>
          </MpFormControl>
          <MpFormControl id="sm-transno">
            <div class="ex-label-row">
              <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
              <button type="button" class="ex-label-icon" :aria-label="t('Transaction no. settings')" @click="noSettingsOpen = true"><MpIcon name="settings" size="sm" /></button>
            </div>
            <MpInput id="sm-transno-input" v-model="transactionNo" :placeholder="t('Auto')" is-full-width is-disabled />
          </MpFormControl>
          <MpFormControl id="sm-refno">
            <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
            <MpInput id="sm-refno-input" v-model="referenceNo" is-full-width />
          </MpFormControl>
          <MpFormControl id="sm-tags">
            <MpFormLabel>{{ t('Tags') }}</MpFormLabel>
            <MpInputTag id="sm-tags-input" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
            <ErpDimensionTagUpsell id="sm-dim-upsell" />
          </MpFormControl>
        </div>

        <!-- Line item type — Expense selected; Account isn't wired up for this flow -->
        <div class="ex-segmented" role="tablist" :aria-label="t('Line item type')">
          <MpButton class="ex-segmented-part ex-segmented-part--active">{{ t('Expense') }}</MpButton>
          <MpButton class="ex-segmented-part" disabled>{{ t('Account') }}</MpButton>
        </div>

        <!-- Line items -->
        <div class="ex-table-section">
          <div class="ex-table-scroll">
            <table class="ex-table ex-lineitems-table sm-table">
              <colgroup>
                <col class="sm-col-expense" />
                <col class="ex-col-desc" />
                <col v-if="showDimensionsColumn" class="sm-col-dimensions" />
                <col class="sm-col-num" />
                <col class="sm-col-num" />
                <col class="sm-col-num" />
                <col class="sm-col-del" />
              </colgroup>
              <thead>
                <tr>
                  <th class="ex-th">{{ t('Expense') }}</th>
                  <th class="ex-th">{{ t('Description') }}</th>
                  <th v-if="showDimensionsColumn" class="ex-th">{{ t('Dimensions') }}</th>
                  <th class="ex-th ex-th--num">{{ t('Balance due') }}</th>
                  <th class="ex-th ex-th--num">{{ t('Total') }}</th>
                  <th class="ex-th ex-th--num">{{ t('Amount') }}</th>
                  <th class="ex-th ex-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id" class="ex-tr">
                  <td class="ex-td ex-td--border sm-expense-cell">
                    <span>{{ row.billLabel }}</span>
                    <MpIcon name="chevrons-down" size="sm" class="sm-expense-chevron" />
                  </td>
                  <td class="ex-td ex-td--input ex-td--border">
                    <MpInput :id="`sm-desc-${row.id}`" v-model="row.description" is-full-width />
                  </td>
                  <td v-if="showDimensionsColumn" class="ex-td ex-td--border sm-td--dimensions">
                    <ErpLineDimensionsCell
                      :id="`sm-dim-${row.id}`"
                      v-model="row.dimensions"
                      transaction-type="expenses"
                    />
                  </td>
                  <td class="ex-td ex-td--border ex-td--readonly">{{ formatIDR(row.balanceDue) }}</td>
                  <td class="ex-td ex-td--border ex-td--readonly">{{ formatIDR(row.total) }}</td>
                  <td class="ex-td ex-td--input ex-td--border ex-td--amount">
                    <div class="ex-amount-cell">
                      <span class="ex-amount-prefix">Rp</span>
                      <MpInput :id="`sm-amount-${row.id}`" v-model="row.amount" type="number" is-full-width class="ex-amount-input" />
                    </div>
                  </td>
                  <td class="ex-td ex-td--del">
                    <div class="ex-cell-center">
                      <MpButton class="ex-del-btn" :disabled="!row.removable" @click="removeRow(row.id)">
                        <MpIcon name="minus-circular" size="sm" />
                      </MpButton>
                    </div>
                  </td>
                </tr>
                <tr class="ex-tr">
                  <td class="ex-td ex-td--input ex-td--border">
                    <MpAutocomplete
                      id="sm-add-expense-ac" v-model="selectedExpenseToAdd" :data="availableExpenseOptions"
                      label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                      :placeholder="t('Select expense')"
                      @update:model-value="onAddExpenseRow"
                    />
                  </td>
                  <td class="ex-td" :colspan="showDimensionsColumn ? 6 : 5" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Message / Memo / Attachment -->
        <div class="ex-notes sm-notes">
          <div class="ex-notes-left">
            <div class="ex-section">
              <MpFormControl id="sm-message">
                <MpFormLabel>{{ t('Message') }}</MpFormLabel>
                <MpTextarea id="sm-message-textarea" v-model="message" is-full-width :rows="3" />
              </MpFormControl>
              <p class="ex-helper-text">{{ t('Visible to vendor') }}</p>
            </div>

            <div class="ex-section">
              <MpFormControl id="sm-memo">
                <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
                <MpTextarea id="sm-memo-textarea" v-model="memo" is-full-width :rows="3" />
              </MpFormControl>
              <p class="ex-helper-text">{{ t('Only visible to you and your team') }}</p>
            </div>

            <div class="ex-section sm-attachment-section">
              <div class="ex-section-label-row">
                <div class="ex-section-label">{{ t('Attachment') }}</div>
              </div>
              <div class="ex-attachment">
                <MpUpload
                  id="sm-attachment-upload"
                  class="ex-attachment-upload"
                  accept=".xls,.xlsx,.doc,.docx,.pdf,.jpg,.jpeg,.png,.zip"
                  is-multiple is-full-width
                  :placeholder="t('or drag and drop here')"
                  :button-text="t('Choose file')"
                  @change="onAttachmentChange"
                />
                <p class="ex-helper-text">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB per file and 5 files per transaction') }}</p>
                <MpUploadList
                  v-for="f in attachedFiles" :key="f.name"
                  :id="`sm-attachment-file-${f.name}`"
                  :title="f.name" status="success" :subtitle="t('Uploaded')"
                  :icon-name="fileIconName(f.name)"
                  is-show-remove-button
                  @remove="removeAttachedFile(f.name)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Footer actions -->
        <footer class="ex-footer">
          <MpButton variant="ghost" is-rounded @click="goBackToExpense">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="handleSave">{{ t('Save') }}</MpButton>
        </footer>
      </div>
    </div>

    <NumberFormatSettingsModal
      v-model:open="noSettingsOpen"
      :title="t('Transaction no. settings')"
      :caption="t('Transaction numbers are auto-generated by the system.')"
      :next-number="nextTxNo"
      :existing-formats="txNoFormats"
      @save="onNoFormatSave"
    />
  </div>

  <!-- Not found fallback -->
  <div v-else class="bd-not-found">
    <p>{{ t('Expense not found.') }}</p>
    <MpTextlink id="sm-not-found-back" as="a" class="detail-breadcrumb" @click.prevent="router.push({ path: '/expenses', query: { tab: 'Bills' } })">{{ t('Back to Expenses') }}</MpTextlink>
  </div>
</template>

<style scoped>
/* ── Page shell — canonical detail pattern (see NewExpensePage/BillDetailsPage) ── */
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
.detail-breadcrumb--static { cursor: default; }
.detail-breadcrumb--static:hover { text-decoration: none; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  /* --mp-line-heights-2xl resolves to a unitless 1.67 in this app (not a px value), which
     computes to 40px on a 24px title — taller than intended and reads as a gap above the
     breadcrumb. Hardcode the real 32px instead of trusting the var/fallback. */
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Single-panel stage — same rounded-corner shell as NewExpensePage's two-panel one ── */
.ex-stage { flex: 1; min-height: 0; display: flex; position: relative; background: var(--mp-colors-gray-50, #EFF1F1); border-radius: 12px 12px 0 0; overflow: hidden; }
.sm-right { border-radius: 12px 12px 0 0; }
.ex-right { flex: 1; min-width: 0; overflow-y: auto; background: var(--mp-background-neutral, white); padding: 24px; container-type: inline-size; }

/* Pay from / Payee are a flex row (not a grid) so Total always stays inline with them,
   regardless of container width — fixed to Transaction date's own column width (316px,
   measured at 1440px) rather than a grid fraction. */
.ex-row-1 {
  display: flex; align-items: flex-end; gap: 24px; flex-wrap: wrap;
  padding-bottom: 20px; border-bottom: 1px dashed var(--mp-border-default);
}
.ex-field-flex { width: 316px; flex-shrink: 0; min-width: 0; }
.ex-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; padding: 20px 0; max-width: 620px; }
@container (min-width: 860px) {
  .ex-grid-2 { grid-template-columns: repeat(4, 1fr); max-width: none; }
}
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ex-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; }
.ex-datepicker { width: 100%; }
.ex-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* Total badge next to Pay from/Payee — same style as BillDetailsPage's inline total */
.sm-total { margin-left: auto; display: flex; align-items: flex-end; padding-bottom: 8px; white-space: nowrap; }
.detail-total-amount { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-total-label { font-weight: var(--mp-font-weights-semi-bold); }

/* ── Segmented control (Expense/Account) ─────────────────────────────────── */
.ex-segmented {
  display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
  padding: var(--mp-spacing-1, 4px); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  margin-bottom: 20px;
}
.ex-segmented-part {
  border: none !important; background: none !important; cursor: pointer;
  padding: var(--mp-spacing-1, 4px) var(--mp-spacing-2, 8px) !important; min-width: 0 !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  font: inherit; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-secondary);
}
.ex-segmented-part:disabled { cursor: not-allowed; opacity: 0.5; }
/* --mp-background-neutral-subtle-selected / --mp-text-secondary-pressed don't resolve
   in this app's token set — fallback hex pinned to the values Figma actually resolves
   to for this component (get_variable_defs on the Segmented control node). */
.ex-segmented-part--active {
  background: var(--mp-background-neutral-subtle-hovered, #ebf0f1) !important;
  color: var(--mp-text-secondary-pressed, #243032);
}

/* ── Line items table ─────────────────────────────────────────────────────── */
.ex-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default); }
.ex-table-scroll { overflow-x: auto; }
.ex-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; border-radius: 0; }
.ex-col-desc { width: auto; }
.sm-col-expense { width: 320px; }
.sm-col-num { width: 180px; }
.sm-col-del { width: 52px; }
/* Dimensions column — one mini combobox per applicable dimension, stacked, so
   the cell needs vertical room and can't stay on the 52px row height. */
.sm-col-dimensions { width: 240px; }
.sm-td--dimensions { padding: var(--mp-spacing-2) var(--mp-spacing-2); }
.ex-lineitems-table .sm-td--dimensions { height: auto; }

.ex-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  font-style: normal; text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.ex-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); }
.ex-th--del { padding: 0; }

.ex-td {
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-4) var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: top;
}
.ex-tr:last-child .ex-td { border-bottom: none; }
.ex-td--input { padding: 0; }
.ex-td--input :deep([class*='input']), .ex-td--input :deep([class*='autocomplete']) { border-radius: 0; border-color: transparent; }
.ex-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.ex-td--del { padding: 0; text-align: center; }
.ex-td--border { border-right: 1px solid var(--mp-border-default); }
/* The Dimensions column can make a row taller than the standard row height —
   every other cell (del button) must pin to the TOP of that taller row. */
.ex-cell-center { display: flex; align-items: center; justify-content: center; height: var(--mp-sizes-13, 52px); }
.ex-td--readonly { text-align: right; background: var(--mp-background-neutral-subtle); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* Expense cell reads as a (disabled) MpSelect — same chevron affordance as the
   "Select expense" row's MpAutocomplete below it. */
.sm-expense-cell { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.sm-expense-chevron { flex-shrink: 0; color: var(--mp-text-secondary); }

.ex-lineitems-table { min-width: 764px; margin-right: auto; }
.ex-lineitems-table .ex-td { height: 52px; border-bottom: 1px solid var(--mp-border-default); }
.ex-lineitems-table .ex-td--amount { padding: 0; }

.ex-amount-cell { display: flex; align-items: stretch; height: 52px; }
.ex-amount-prefix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); border-radius: 0;
}
.ex-amount-input { flex: 1; min-width: 0; }

.ex-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0;
}
.ex-del-btn:hover { background: var(--mp-background-neutral) !important; color: var(--mp-text-danger, #dc2626); }
.ex-del-btn:disabled { cursor: not-allowed; opacity: 0.4; }
.ex-del-btn:disabled:hover { background: none; color: var(--mp-text-secondary); }

/* ── Message/Memo/Attachment ──────────────────────────────────────────────── */
.sm-notes { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-2); }
.ex-notes-left { display: flex; flex-direction: column; }
.ex-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 440px; padding: var(--mp-spacing-4) 0; }
.ex-section-label-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-1); }
.ex-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ex-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
/* Matches Transaction date's column width (measured at 1440px, one quarter of
   .ex-right's content width in the 4-column grid above). */
/* .ex-section's flex `gap` would stack on top of .ex-section-label-row's own
   margin-bottom — zero it here so the label-to-field gap is exactly 4px. */
.sm-attachment-section { width: 316px; flex-shrink: 0; gap: 0; }
.ex-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ex-attachment-upload :deep(p[data-pixel-component="MpText"]) { color: var(--mp-text-placeholder, #6e7a7c) !important; }

/* ── Footer ───────────────────────────────────────────────────────────────── */
.ex-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-6); }

.bd-not-found { padding: var(--mp-spacing-6); }
</style>
