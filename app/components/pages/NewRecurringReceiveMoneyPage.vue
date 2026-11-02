<script setup lang="ts">
/**
 * New recurring receive money — the Receive money branch of the Recurring
 * transactions type picker.
 *
 * Shell, field rows and sticky footer follow InternalTransferFormPage (the cash
 * /bank form); the line-items table is the New expense table verbatim, which
 * docs/patterns/FormTable.md names as the reference for exactly this screen.
 * The schedule block is the one from NewRecurringSalesInvoicePage. Transaction
 * date is absent on purpose — a template is governed by its Start date.
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpButton, MpInput, MpAutocomplete, MpDatePicker, MpInputTag, MpTextarea, MpUpload, MpUploadList,
  MpIcon, MpCheckbox, MpTextlink, MpFormControl, MpFormLabel, MpFormErrorMessage, toast,
  type DataInterface,
} from '@mekari/pixel3'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import { cashAccounts } from '~/data/cashAccounts'
import { customers } from '~/data/customers'
import { addRecurringOtherTransaction, frequencyLabel } from '~/data/recurringTransactions'

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

// ── Deposit to (cash/bank account) + Payer ───────────────────────────────────
const accountOptions = computed(() =>
  cashAccounts.filter(a => !a.isArchived).map(a => ({ id: a.id, name: `${a.code} ${a.name}` })),
)
const depositToId = ref('')
const depositToError = ref(false)

// The payer is the counterparty the index shows in its Name column.
const payerOptions = computed(() => customers.map(c => ({ id: c.id, name: c.name })))
const payerId = ref('')

const transactionNo = ref('')
const referenceNo = ref('')
const tags = ref<DataInterface[]>([])
function onTagsChange(data: DataInterface[]) { tags.value = data }

const noSettingsOpen = ref(false)
const txNoFormats = [{ label: t('Auto'), value: 'auto' }]
function onNoFormatSave(_config: NumberFormatConfig) { noSettingsOpen.value = false }

// ── Recurring schedule ───────────────────────────────────────────────────────
const repeatInterval = ref(1)
const repeatUnit = ref<'day' | 'week' | 'month' | 'year'>('month')
const repeatUnitOptions = [
  { label: t('Day'), value: 'day' },
  { label: t('Week'), value: 'week' },
  { label: t('Month'), value: 'month' },
  { label: t('Year'), value: 'year' },
]
const endRepeat = ref<'never' | 'after' | 'on'>('never')
const endRepeatOptions = [
  { label: t('Repeat forever'), value: 'never' },
  { label: t('End after'), value: 'after' },
  { label: t('End on'), value: 'on' },
]
const endAfterCount = ref(12)
const endOnDate = ref('')
const startDate = ref(todayDisplay)
const sendAutoEmail = ref(false)

const nextTransactionDate = computed(() => {
  if (!startDate.value) return ''
  const d = new Date(toISODate(startDate.value))
  if (Number.isNaN(d.getTime())) return ''
  const n = repeatInterval.value || 1
  if (repeatUnit.value === 'day') d.setDate(d.getDate() + n)
  else if (repeatUnit.value === 'week') d.setDate(d.getDate() + n * 7)
  else if (repeatUnit.value === 'month') d.setMonth(d.getMonth() + n)
  else d.setFullYear(d.getFullYear() + n)
  return toDisplayDate(d.toISOString().slice(0, 10))
})

// ── Line items — New expense table, minus drag and dimensions (not in the design) ──
const ACCOUNT_OPTIONS = cashAccounts
  .filter(a => !a.isArchived)
  .map(a => ({ id: a.id, name: `${a.code} ${a.name}` }))
const TAX_OPTIONS = [
  { id: 'ppn11', name: 'PPN 11%' },
  { id: 'none', name: t('No tax') },
]

interface LineRow {
  id: number
  accountId: string
  description: string
  taxId: string
  amount: string
  accountError: boolean
  amountError: boolean
  /** Once an account is picked the rest of the columns stay visible, even if cleared. */
  revealed: boolean
}
let rowSeq = 0
function makeRow(): LineRow {
  return { id: rowSeq++, accountId: '', description: '', taxId: '', amount: '', accountError: false, amountError: false, revealed: false }
}
const rows = ref<LineRow[]>([makeRow()])

function onAccountSelect(row: LineRow) {
  if (row.accountId) { row.revealed = true; row.accountError = false }
  const last = rows.value[rows.value.length - 1]
  if (last && last.id === row.id) rows.value.push(makeRow())
}
function removeRow(id: number) {
  if (rows.value.length === 1) return
  rows.value = rows.value.filter(r => r.id !== id)
}

const priceIncludesTax = ref(false)

// ── Totals — same inclusive/exclusive rule as the expense form ───────────────
const lineSum = computed(() => rows.value.reduce((s, r) => s + (Number(r.amount) || 0), 0))
const taxableSubtotal = computed(() => rows.value.filter(r => r.taxId === 'ppn11').reduce((s, r) => s + (Number(r.amount) || 0), 0))
const hasPpnTax = computed(() => taxableSubtotal.value > 0)
const ppnAmount = computed(() => priceIncludesTax.value
  ? Math.round(taxableSubtotal.value * 11 / 111)
  : Math.round(taxableSubtotal.value * 0.11))
const subtotal = computed(() => priceIncludesTax.value ? lineSum.value - ppnAmount.value : lineSum.value)
const total = computed(() => subtotal.value + ppnAmount.value)

// ── Message / Memo / Attachment ──────────────────────────────────────────────
const message = ref('')
const memo = ref('')
const attachedFiles = ref<File[]>([])
function onAttachmentChange(payload: Event | FileList | null) {
  // MpUpload's @change emits the native Event (ev.target.files), not a
  // FileList. Accept both so the field actually stages what was picked.
  const files: FileList | null | undefined =
    payload && 'target' in payload ? (payload.target as HTMLInputElement).files : (payload as FileList | null)
  if (!files) return
  for (const f of Array.from(files)) {
    if (!attachedFiles.value.some(x => x.name === f.name)) attachedFiles.value.push(f)
  }
}
function removeAttachedFile(name: string) {
  attachedFiles.value = attachedFiles.value.filter(f => f.name !== name)
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

function goBack() { router.push('/recurring-transactions') }

// ── Save ─────────────────────────────────────────────────────────────────────
function validateLineItems(): boolean {
  let valid = true
  const toCheck = rows.value.length > 1 ? rows.value.slice(0, -1) : rows.value
  toCheck.forEach(row => {
    if (!row.accountId) { row.accountError = true; valid = false }
    if (!(Number(row.amount) > 0)) { row.amountError = true; valid = false }
  })
  return valid
}

function handleSave() {
  let ok = true
  if (!depositToId.value) { depositToError.value = true; ok = false }
  if (!validateLineItems()) ok = false
  if (!ok) return

  const payer = payerOptions.value.find(p => p.id === payerId.value)
  const account = accountOptions.value.find(a => a.id === depositToId.value)

  addRecurringOtherTransaction({
    templateName: message.value.trim() || `${t('Receive money')} — ${account?.name ?? ''}`.trim(),
    type: 'Receive money',
    party: payer ?? { id: '', name: account?.name ?? '—' },
    frequency: frequencyLabel(repeatInterval.value || 1, repeatUnit.value),
    amount: total.value,
    nextDate: toISODate(nextTransactionDate.value || startDate.value),
    status: 'active',
    createdCount: 0,
    schedule: {
      repeatInterval: repeatInterval.value || 1,
      repeatUnit: repeatUnit.value,
      endRepeat: endRepeat.value,
      endAfterCount: endRepeat.value === 'after' ? endAfterCount.value : undefined,
      endOnDate: endRepeat.value === 'on' && endOnDate.value ? toISODate(endOnDate.value) : undefined,
      startDate: toISODate(startDate.value),
      sendAutoEmail: sendAutoEmail.value,
    },
  })
  toast.notify({ variant: 'success', title: t('Recurring transaction created') })
  goBack()
}

// ── Sticky footer (border appears once the stage scrolls) ────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
  })
})
onUnmounted(() => { stageObserver?.disconnect() })
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="rm-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Recurring transactions') }}</MpTextlink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('New recurring receive money') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="it-stage" data-devchange="recurring-receive-money-form">

      <!-- Deposit to + Payer + Total -->
      <div class="ex-row-1">
        <MpFormControl id="rm-deposit-to" class="ex-field-flex" :is-invalid="depositToError" is-required>
          <MpFormLabel>{{ t('Deposit to') }}</MpFormLabel>
          <MpAutocomplete
            id="rm-deposit-to-ac"
            v-model="depositToId"
            :data="accountOptions"
            label-prop="name" value-prop="id"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="depositToError"
            :placeholder="t('Select account')"
            @update:model-value="depositToError = false"
          />
          <MpFormErrorMessage>{{ t('You must select an account') }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl id="rm-payer" class="ex-field-flex">
          <MpFormLabel>{{ t('Payer') }}</MpFormLabel>
          <MpAutocomplete
            id="rm-payer-ac"
            v-model="payerId"
            :data="payerOptions"
            label-prop="name" value-prop="id"
            is-searchable is-clearable use-portal is-full-width
            :placeholder="t('Select payer')"
          />
        </MpFormControl>
        <div class="it-total-inline">
          <span class="detail-total-amount">
            <span class="detail-total-label">{{ t('Total') }}</span> {{ formatIDR(total) }}
          </span>
        </div>
      </div>

      <!-- Transaction no. / Reference no. / Tags -->
      <div class="ex-grid-2 rm-row-divider">
        <MpFormControl id="rm-transno">
          <div class="ex-label-row">
            <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
            <MpButton class="ex-label-icon" type="button" left-icon="settings" :aria-label="t('Transaction no. settings')" @click="noSettingsOpen = true" />
          </div>
          <MpInput id="rm-transno-input" v-model="transactionNo" :placeholder="t('Auto')" is-full-width is-disabled />
        </MpFormControl>
        <MpFormControl id="rm-refno">
          <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
          <MpInput id="rm-refno-input" v-model="referenceNo" is-full-width />
        </MpFormControl>
        <MpFormControl id="rm-tags">
          <MpFormLabel>{{ t('Tags') }}</MpFormLabel>
          <MpInputTag id="rm-tags-input" :data="tags" :is-enable-create-new-tag="true" :is-show-suggestions="false" @change="onTagsChange" />
        </MpFormControl>
      </div>

      <!-- Recurring schedule -->
      <div class="ex-grid-2">
        <MpFormControl id="rm-repeat">
          <MpFormLabel>{{ t('Repeats every') }}</MpFormLabel>
          <div class="rm-repeat-row">
            <MpInput id="rm-repeat-interval" v-model.number="repeatInterval" type="number" :min="1" class="rm-repeat-num" />
            <MpAutocomplete
              id="rm-repeat-unit" v-model="repeatUnit" :data="repeatUnitOptions"
              label-prop="label" value-prop="value" use-portal is-full-width class="rm-repeat-unit"
            />
          </div>
          <span class="ex-helper-text">{{ t('Next transaction date') }}: {{ nextTransactionDate || '—' }}</span>
        </MpFormControl>
        <MpFormControl id="rm-end-repeat">
          <MpFormLabel>{{ t('End repeat') }}</MpFormLabel>
          <MpAutocomplete
            id="rm-end-repeat-inp" v-model="endRepeat" :data="endRepeatOptions"
            label-prop="label" value-prop="value" use-portal is-full-width
          />
          <div v-if="endRepeat === 'after'" class="rm-end-sub">
            <MpInput id="rm-end-after-count" v-model.number="endAfterCount" type="number" :min="1" class="rm-repeat-num" />
            <span class="rm-end-label">{{ t('occurrences') }}</span>
          </div>
          <div v-if="endRepeat === 'on'" class="rm-end-sub">
            <MpDatePicker id="rm-end-on-date" v-model="endOnDate" format="DD/MM/YYYY" value-type="format" use-portal />
          </div>
        </MpFormControl>
        <MpFormControl id="rm-start-date">
          <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
          <div class="ex-datepicker">
            <MpDatePicker id="rm-start-date-dp" v-model="startDate" format="DD/MM/YYYY" value-type="format" use-portal />
          </div>
        </MpFormControl>
        <div class="rm-auto-email">
          <MpCheckbox id="rm-send-auto-email" :is-checked="sendAutoEmail" @change="sendAutoEmail = !sendAutoEmail" />
          <span>{{ t('Send automatic email') }}</span>
        </div>
      </div>

      <!-- Price includes tax -->
      <div class="rm-price-includes">
        <MpCheckbox id="rm-price-incl" :is-checked="priceIncludesTax" @change="priceIncludesTax = !priceIncludesTax" />
        <span>{{ t('Price includes tax') }}</span>
      </div>

      <!-- Line items — the recurring-form items table (NewRecurringSalesInvoicePage) -->
      <section class="si-items-section">
        <div class="si-items-scroll">
          <table class="si-items-table">
            <colgroup>
              <col class="si-col-account" />
              <col class="si-col-desc" />
              <col class="si-col-tax" />
              <col class="si-col-amount" />
              <col class="si-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="si-th">{{ t('Account') }}</th>
                <th class="si-th">{{ t('Description') }}</th>
                <th class="si-th">{{ t('Tax') }}</th>
                <th class="si-th">{{ t('Amount') }}</th>
                <th class="si-th si-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id">
                <td class="si-td si-td--input si-td--border" :class="{ 'si-td--error': row.accountError }">
                  <MpAutocomplete
                    :id="`rm-account-${row.id}`" v-model="row.accountId" :data="ACCOUNT_OPTIONS"
                    label-prop="name" value-prop="id" is-searchable is-clearable use-portal is-full-width
                    :placeholder="t('Select account')"
                    @update:model-value="onAccountSelect(row)"
                  />
                </td>
                <template v-if="row.revealed">
                  <td class="si-td si-td--input si-td--border">
                    <MpInput :id="`rm-desc-${row.id}`" v-model="row.description" is-full-width />
                  </td>
                  <td class="si-td si-td--input si-td--border">
                    <MpAutocomplete
                      :id="`rm-tax-${row.id}`" v-model="row.taxId" :data="TAX_OPTIONS"
                      label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                      :placeholder="t('Select tax')"
                    />
                  </td>
                  <td class="si-td si-td--input si-td--border si-td--affix" :class="{ 'si-td--error': row.amountError }">
                    <div class="si-affix-cell">
                      <span class="si-affix">Rp</span>
                      <MpInput
                        :id="`rm-amount-${row.id}`" v-model="row.amount" type="number" is-full-width class="si-affix-input"
                        @update:model-value="row.amountError = false"
                      />
                    </div>
                  </td>
                  <td class="si-td si-td--del">
                    <div class="si-cell-center">
                      <MpButton class="si-del-btn" :aria-label="t('Delete')" @click="removeRow(row.id)">
                        <MpIcon name="minus-circular" size="sm" />
                      </MpButton>
                    </div>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Message / Memo / Attachment + Totals -->
      <div class="rm-notes">
        <div class="rm-notes-left">
          <div class="ex-section">
            <MpFormControl id="rm-message">
              <MpFormLabel>{{ t('Message') }}</MpFormLabel>
              <MpTextarea id="rm-message-textarea" v-model="message" is-full-width :rows="3" />
            </MpFormControl>
            <p class="ex-helper-text">{{ t('Visible to customer/vendor') }}</p>
          </div>

          <div class="ex-section">
            <MpFormControl id="rm-memo">
              <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
              <MpTextarea id="rm-memo-textarea" v-model="memo" is-full-width :rows="3" />
            </MpFormControl>
            <p class="ex-helper-text">{{ t('Only visible to you and your team') }}</p>
          </div>

          <div class="ex-section">
            <div class="ex-section-label-row">
              <div class="ex-section-label">{{ t('Attachment') }}</div>
            </div>
            <div class="ex-attachment">
              <MpUpload
                id="rm-attachment-upload"
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
                :id="`rm-attachment-file-${f.name}`"
                :title="f.name" status="success" :subtitle="t('Uploaded')"
                :icon-name="fileIconName(f.name)"
                is-show-remove-button
                @remove="removeAttachedFile(f.name)"
              />
            </div>
          </div>
        </div>

        <div class="rm-totals">
          <div class="rm-total-row">
            <span class="rm-total-label rm-total-label--strong">{{ t('Subtotal') }}</span>
            <span class="rm-total-amt rm-total-amt--strong">{{ formatIDR(subtotal) }}</span>
          </div>
          <div v-if="hasPpnTax" class="rm-total-row">
            <span class="rm-total-label">PPN 11%</span>
            <span class="rm-total-amt">{{ formatIDR(ppnAmount) }}</span>
          </div>
          <div class="rm-total-rule" />
          <div class="rm-total-row">
            <span class="rm-total-label rm-total-label--strong">{{ t('Total') }}</span>
            <span class="rm-total-amt rm-total-amt--strong">{{ formatIDR(total) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Sticky footer actions ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">{{ t('Save') }}</MpButton>
    </footer>

    <NumberFormatSettingsModal
      v-model:open="noSettingsOpen"
      :title="t('Transaction no. settings')"
      :caption="t('Transaction numbers are auto-generated by the system.')"
      next-number="Auto"
      :existing-formats="txNoFormats"
      @save="onNoFormatSave"
    />
  </div>
</template>

<style scoped>
/* ── Page shell — sticky-footer detail pattern (InternalTransferFormPage) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6);
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
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}

.it-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-neutral, white); border-radius: 12px 12px 0 0;
  padding: var(--mp-spacing-6); container-type: inline-size;
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) 24px; background: var(--mp-background-neutral, white);
  border-top: 1px solid transparent; transition: border-top-color 0.15s;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Deposit to + Payer + Total row ── */
/* Row 1 shares .ex-grid-2's track sizing so its fields line up with the rows
   below it — a flex row with fixed-width fields does not. */
.ex-row-1 {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; align-items: end;
  padding-bottom: 20px; border-bottom: 1px dashed var(--mp-border-default, #e3e7e9);
}
@container (min-width: 860px) {
  .ex-row-1 { grid-template-columns: repeat(4, 1fr); }
}
.ex-field-flex { min-width: 0; }
.it-total-inline {
  grid-column: 1 / -1; justify-self: end;
  display: flex; align-items: flex-end; padding-bottom: var(--mp-spacing-2); white-space: nowrap;
}
@container (min-width: 860px) {
  .it-total-inline { grid-column: 3 / -1; }
}
.detail-total-amount { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-total-label { font-weight: var(--mp-font-weights-semi-bold); }

/* ── Field grids ── */
.ex-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; padding: 20px 0 40px; max-width: 620px; }
@container (min-width: 860px) {
  .ex-grid-2 { grid-template-columns: repeat(4, 1fr); max-width: none; }
}
.rm-row-divider { padding-bottom: 20px; border-bottom: 1px dashed var(--mp-border-default, #e3e7e9); }
.ex-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ex-label-icon { display: flex; align-items: center; color: var(--mp-text-secondary); cursor: pointer; background: none; border: none; padding: 0; }
.ex-datepicker { width: 100%; }
.ex-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.rm-repeat-row { display: flex; gap: var(--mp-spacing-2); }
.rm-repeat-num { flex: 0 0 72px; }
.rm-repeat-unit { flex: 1; min-width: 0; }
.rm-end-sub { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }
.rm-end-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rm-auto-email { display: flex; align-items: center; gap: var(--mp-spacing-2); align-self: end; padding-bottom: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.rm-price-includes { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* ── Line items table — copied from the recurring sales invoice form so all five
   recurring forms share one table. The .mp-input__control reset is load-bearing:
   without it Pixel's own focus ring shows through the cell as a rounded blue
   box instead of the cell's inset ring. ── */
.si-items-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.si-items-scroll { overflow-x: auto; }
.si-items-table {
  width: 100%; min-width: 860px;
  table-layout: fixed; border-collapse: collapse; border-spacing: 0;
}
.si-col-account { width: 280px; }
.si-col-desc    { width: auto; }
.si-col-tax     { width: 128px; }
.si-col-amount  { width: 164px; }
.si-col-del     { width: 52px; }

.si-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  white-space: nowrap;
}
.si-th--del { padding: 0; }

.si-td {
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  vertical-align: top;
}
.si-td--border { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.si-td--del { padding: 0; text-align: center; }
.si-cell-center { display: flex; align-items: center; justify-content: center; height: var(--mp-sizes-10, 40px); }
.si-td--input { padding: 0; position: relative; }
.si-td--input :deep([class*='input']),
.si-td--input :deep([class*='select']) { border-radius: 0; border-color: transparent; }
.si-td--input :deep(.mp-input__root),
.si-td--input :deep(.mp-select__root) { height: var(--mp-sizes-10, 40px); background: transparent; }
.si-td--input :deep(.mp-input__control),
.si-td--input :deep(.mp-select__control) {
  height: var(--mp-sizes-10, 40px);
  min-width: 0; width: 100%;
  border: none; border-radius: 0;
  box-shadow: var(--mp-shadows-none, none); /* pixel-police-allow-shadow: removing the default shadow */
}
.si-td--input:focus-within::after {
  content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none;
  box-shadow: inset 0 0 0 2px var(--mp-colors-border-bold, #8c9596); /* pixel-police-allow-shadow: neutral slate focus ring over collapsed borders (rule: never a brand colour) */
}

.si-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.si-td--error :deep([class*='input']) { background: transparent; }

.si-td--affix { padding: 0; position: relative; }
.si-affix-cell { display: flex; align-items: stretch; position: absolute; inset: 0; min-height: var(--mp-sizes-10, 40px); }
.si-affix {
  flex-shrink: 0; display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2) 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.si-affix-input { flex: 1 1 0; min-width: 0; }

.si-del-btn { background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); display: flex; align-items: center; justify-content: center; }
.si-del-btn:hover { color: var(--mp-text-default); }

/* ── Notes + totals — same container rule as the expense form ── */
.rm-notes { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-5); }
.rm-notes-left { display: flex; flex-direction: column; gap: var(--mp-spacing-6); flex-shrink: 0; order: 2; }
.ex-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 320px; }
.ex-helper-text { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
.ex-section-label-row { margin-bottom: var(--mp-spacing-1); }
.ex-section-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ex-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ex-attachment-upload :deep(p[data-pixel-component="MpText"]) { color: var(--mp-text-placeholder, #6e7a7c) !important; }

.rm-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); width: min(428px, 32.4cqw); flex-shrink: 0; padding-top: var(--mp-spacing-2); order: 1; }
@container (min-width: 720px) {
  .rm-notes { flex-direction: row; justify-content: space-between; align-items: flex-start; }
  .rm-notes-left { order: 1; }
  .rm-totals { order: 2; }
}
.rm-total-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.rm-total-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.rm-total-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.rm-total-label--strong, .rm-total-amt--strong {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.rm-total-rule {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(to right, var(--mp-border-default) 0, var(--mp-border-default) 4px, transparent 4px, transparent 8px);
}
</style>
